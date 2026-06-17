"""
Real-time anomaly detection using the Welford online algorithm.

Tracks mean and variance of token costs and latencies. No matter how
many data points we've seen, only 3 numbers are stored (n, mean, M2).

When a new data point is more than z_threshold standard deviations
from the mean, it's flagged as anomalous and triggers an alert.
"""

import structlog

log = structlog.get_logger()


class WelfordDetector:
    """
    Welford's online algorithm for computing mean and variance.
    Reference: https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
    """

    def __init__(self, name: str, z_threshold: float = 3.0, min_samples: int = 10):
        self.name = name
        self.z_threshold = z_threshold
        self.min_samples = min_samples

        self.n = 0
        self.mean = 0.0
        self._M2 = 0.0   # sum of squared deviations from mean

    def update(self, value: float) -> bool:
        """
        Add a new observation. Returns True if the value is anomalous.
        The first min_samples values are never flagged since we need
        enough data to establish a baseline first.
        """
        self.n += 1

        # Welford's incremental update
        delta = value - self.mean
        self.mean += delta / self.n
        delta2 = value - self.mean
        self._M2 += delta * delta2

        if self.n < self.min_samples:
            return False   # not enough data yet

        variance = self._M2 / (self.n - 1)
        std = variance ** 0.5

        if std == 0:
            return False   # all values identical so far

        z_score = abs(value - self.mean) / std
        is_anomaly = z_score > self.z_threshold

        if is_anomaly:
            log.warning(
                "anomaly_detected",
                metric=self.name,
                value=value,
                mean=round(self.mean, 2),
                std=round(std, 2),
                z_score=round(z_score, 2),
            )

        return is_anomaly

    @property
    def std(self) -> float:
        if self.n < 2:
            return 0.0
        return (self._M2 / (self.n - 1)) ** 0.5

    def stats(self) -> dict:
        return {
            "metric": self.name,
            "n": self.n,
            "mean": round(self.mean, 2),
            "std": round(self.std, 2),
        }


# One detector per metric, both live for the lifetime of the process
token_detector = WelfordDetector("tokens_per_task", z_threshold=3.0)
latency_detector = WelfordDetector("latency_ms", z_threshold=3.0)


def record_task_metrics(tokens: int, latency_ms: int, task_id: str = "") -> dict:
    """
    Call this after every completed task.
    Returns which metrics (if any) were anomalous.
    """
    token_anomaly = token_detector.update(float(tokens))
    latency_anomaly = latency_detector.update(float(latency_ms))

    result = {
        "token_anomaly": token_anomaly,
        "latency_anomaly": latency_anomaly,
        "token_stats": token_detector.stats(),
        "latency_stats": latency_detector.stats(),
    }

    if token_anomaly or latency_anomaly:
        from observability.slack_alerter import send_alert
        send_alert(
            title="Synapse anomaly detected",
            details={
                "task_id": task_id,
                "tokens": tokens,
                "latency_ms": latency_ms,
                "token_anomaly": token_anomaly,
                "latency_anomaly": latency_anomaly,
            },
        )

    return result
