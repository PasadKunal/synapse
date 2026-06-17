"""
OpenTelemetry setup for distributed tracing across HTTP requests,
database queries, and background tasks.

Traces are exported to an OTLP collector (configured via env var).
During local dev with no collector running, traces are printed to
the console so you can still see what's happening.
"""

import os

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

log = structlog.get_logger()


def setup_tracing(app) -> None:
    """
    Call this once at FastAPI startup.
    - If OTEL_EXPORTER_OTLP_ENDPOINT is set: exports to that collector
    - Otherwise: prints spans to console (good for local dev)
    """
    resource = Resource.create({"service.name": "synapse", "service.version": "0.1.0"})
    provider = TracerProvider(resource=resource)

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if otlp_endpoint:
        exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
        log.info("otel_exporter", type="otlp", endpoint=otlp_endpoint)
    else:
        exporter = ConsoleSpanExporter()
        log.info("otel_exporter", type="console")

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    SQLAlchemyInstrumentor().instrument()

    log.info("tracing_ready")


def get_tracer(name: str = "synapse"):
    return trace.get_tracer(name)
