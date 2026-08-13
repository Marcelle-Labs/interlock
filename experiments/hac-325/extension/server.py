"""Trivial CONTENT_AUTHZ ext_proc extension for the HAC-325 / S0 topology gate.

This is a disposable feasibility probe. It carries no Interlock policy logic:
the decision is a single deterministic marker test, so that a round trip proves
the *topology* rather than any product behaviour.

CONTENT_AUTHZ requires FULL_DUPLEX_STREAMED body processing, which means Envoy
does not retain the body for us -- whatever we want forwarded we must stream
back. Inspect-only therefore still echoes every chunk verbatim.
"""

import json
import os
import sys
import time
from concurrent import futures

import grpc
from envoy.service.ext_proc.v3 import external_processor_pb2 as ep
from envoy.service.ext_proc.v3 import external_processor_pb2_grpc as ep_grpc
from envoy.type.v3 import http_status_pb2

# The one deterministic rule. A request whose body contains this marker is
# denied; everything else is allowed. Nothing else influences the decision.
DENY_MARKER = b"interlock-s0-deny"

DENY_REASON = "interlock-s0: deterministic marker deny (no product policy)"


def log(event, **fields):
    """Structured line so Cloud Logging keeps the fields queryable."""
    record = {"severity": "INFO", "event": event, "ts": time.time_ns(), **fields}
    print(json.dumps(record), file=sys.stdout, flush=True)


def _streamed_body_response(body, end_of_stream):
    """Echo a body chunk back unchanged, as FULL_DUPLEX_STREAMED requires."""
    return ep.ProcessingResponse(
        request_body=ep.BodyResponse(
            response=ep.CommonResponse(
                body_mutation=ep.BodyMutation(
                    streamed_response=ep.StreamedBodyResponse(
                        body=body, end_of_stream=end_of_stream
                    )
                )
            )
        )
    )


def _streamed_response_body_response(body, end_of_stream):
    return ep.ProcessingResponse(
        response_body=ep.BodyResponse(
            response=ep.CommonResponse(
                body_mutation=ep.BodyMutation(
                    streamed_response=ep.StreamedBodyResponse(
                        body=body, end_of_stream=end_of_stream
                    )
                )
            )
        )
    )


def _deny():
    return ep.ProcessingResponse(
        immediate_response=ep.ImmediateResponse(
            status=http_status_pb2.HttpStatus(code=403),
            body=DENY_REASON.encode("utf-8"),
            details=DENY_REASON,
        )
    )


class Processor(ep_grpc.ExternalProcessorServicer):
    def Process(self, request_iterator, context):
        stream_id = os.urandom(8).hex()
        started = time.perf_counter_ns()
        request_body = bytearray()
        response_body = bytearray()
        seen = []

        log("stream.open", stream=stream_id, peer=context.peer())

        for req in request_iterator:
            kind = req.WhichOneof("request")
            seen.append(kind)

            if kind == "request_headers":
                headers = {
                    h.key: (h.raw_value.decode("utf-8", "replace") or h.value)
                    for h in req.request_headers.headers.headers
                }
                # Identity fields land here; S2 (HAC-326) owns characterising
                # them. S0 only records what arrived.
                log(
                    "request_headers",
                    stream=stream_id,
                    header_names=sorted(headers),
                    headers=headers,
                    end_of_stream=req.request_headers.end_of_stream,
                )
                yield ep.ProcessingResponse(
                    request_headers=ep.HeadersResponse(response=ep.CommonResponse())
                )

            elif kind == "request_body":
                chunk = req.request_body.body
                request_body.extend(chunk)
                last = req.request_body.end_of_stream
                log(
                    "request_body",
                    stream=stream_id,
                    chunk_bytes=len(chunk),
                    total_bytes=len(request_body),
                    end_of_stream=last,
                )
                if not last:
                    continue
                if DENY_MARKER in bytes(request_body):
                    log(
                        "decision",
                        stream=stream_id,
                        decision="DENY",
                        reason=DENY_REASON,
                        elapsed_ns=time.perf_counter_ns() - started,
                    )
                    yield _deny()
                    return
                log(
                    "decision",
                    stream=stream_id,
                    decision="ALLOW",
                    elapsed_ns=time.perf_counter_ns() - started,
                )
                yield _streamed_body_response(bytes(request_body), True)

            elif kind == "response_headers":
                log(
                    "response_headers",
                    stream=stream_id,
                    end_of_stream=req.response_headers.end_of_stream,
                )
                yield ep.ProcessingResponse(
                    response_headers=ep.HeadersResponse(response=ep.CommonResponse())
                )

            elif kind == "response_body":
                chunk = req.response_body.body
                response_body.extend(chunk)
                last = req.response_body.end_of_stream
                log(
                    "response_body",
                    stream=stream_id,
                    chunk_bytes=len(chunk),
                    total_bytes=len(response_body),
                    end_of_stream=last,
                )
                if last:
                    yield _streamed_response_body_response(bytes(response_body), True)

            elif kind == "request_trailers":
                log("request_trailers", stream=stream_id)
                yield ep.ProcessingResponse(request_trailers=ep.TrailersResponse())

            elif kind == "response_trailers":
                log("response_trailers", stream=stream_id)
                yield ep.ProcessingResponse(response_trailers=ep.TrailersResponse())

        log(
            "stream.close",
            stream=stream_id,
            events=seen,
            request_bytes=len(request_body),
            response_bytes=len(response_body),
            elapsed_ns=time.perf_counter_ns() - started,
        )


def serve():
    port = os.environ.get("PORT", "8080")
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    ep_grpc.add_ExternalProcessorServicer_to_server(Processor(), server)
    server.add_insecure_port(f"0.0.0.0:{port}")
    server.start()
    log("server.start", port=port, deny_marker=DENY_MARKER.decode())
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
