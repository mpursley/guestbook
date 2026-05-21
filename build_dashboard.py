import json
import copy

def create_row(id, title, y):
    return {
        "id": id,
        "title": title,
        "type": "row",
        "collapsed": False,
        "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}
    }

def create_timeseries(id, title, targets, y, x=0, w=12, h=8, format="none"):
    return {
        "id": id,
        "title": title,
        "type": "timeseries",
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "targets": [
            {"expr": expr, "legendFormat": legend, "refId": chr(65+i)}
            for i, (expr, legend) in enumerate(targets)
        ],
        "fieldConfig": {
            "defaults": {
                "custom": {
                    "drawStyle": "line",
                    "lineWidth": 2,
                    "fillOpacity": 10,
                    "spanNulls": False
                },
                "unit": format
            }
        },
        "options": {
            "legend": {"showLegend": True, "displayMode": "list", "placement": "bottom"},
            "tooltip": {"mode": "single"}
        }
    }

def create_text(id, title, content, y, x=0, w=12, h=8):
    return {
        "id": id,
        "title": title,
        "type": "text",
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "options": {
            "content": content,
            "mode": "markdown"
        }
    }

panels = []

# Row 1: Key Metrics (Request Rates, Error Rates, Pod Resource Usage)
panels.append(create_row(100, "Key Metrics", 0))
panels.append(create_timeseries(1, "Frontend HTTP Requests (Per Second)", [('rate(apache_accesses_total[1m])', 'Requests / sec')], 1, 0))
panels.append(create_text(15, "Frontend Error Rates", "> **Note:** The standard Apache `server-status` page (scraped by `apache_exporter`) does not provide HTTP response code metrics (like 404s or 500s).\\n\\nTo capture error rates natively in Kubernetes, we would need to deploy either an Ingress Controller (like NGINX Ingress) or a log aggregator (like Promtail/Loki) to parse the Apache access logs.", 1, 12))
panels.append(create_timeseries(3, "Pod CPU Usage", [('sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"(frontend|redis).*"}[1m])) by (pod)', '{{pod}}')], 9, 0, format="percentunit"))
panels.append(create_timeseries(10, "Pod Memory Usage", [('sum(container_memory_usage_bytes{namespace="default", pod=~"(frontend|redis).*"}) by (pod)', '{{pod}}')], 9, 12, format="bytes"))

# Row 2: System Metrics
panels.append(create_row(101, "System Metrics", 17))
panels.append(create_timeseries(2, "Redis Memory Usage", [('redis_memory_used_bytes', '{{instance}}')], 18, 0, format="bytes"))
panels.append(create_timeseries(4, "Redis Connected Clients", [('redis_connected_clients', '{{instance}}')], 18, 12))
panels.append(create_timeseries(14, "Pod Restarts", [('kube_pod_container_status_restarts_total{namespace="default", pod=~"(frontend|redis).*"}', '{{pod}} - {{container}}')], 26, 0))
panels.append(create_timeseries(13, "Pod Network Traffic", [
    ('rate(container_network_receive_bytes_total{namespace="default", pod=~"(frontend|redis).*"}[1m])', '{{pod}} (In)'),
    ('rate(container_network_transmit_bytes_total{namespace="default", pod=~"(frontend|redis).*"}[1m])', '{{pod}} (Out)')
], 26, 12, format="Bps"))

# Row 3: Additional Metrics
panels.append(create_row(102, "Additional Metrics", 34))
panels.append(create_timeseries(11, "Redis Hit Ratio", [('sum(rate(redis_keyspace_hits_total[1m])) / (sum(rate(redis_keyspace_hits_total[1m])) + sum(rate(redis_keyspace_misses_total[1m])))', 'Hit Ratio')], 35, 0, format="percentunit"))
panels.append(create_timeseries(12, "Apache Worker Status (Scoreboard)", [('apache_scoreboard', '{{state}}')], 35, 12))


dashboard = {
    "title": "Guestbook Overview",
    "schemaVersion": 38,
    "tags": ["guestbook", "kubernetes"],
    "timezone": "browser",
    "panels": panels,
    "refresh": "5s"
}

with open("examples/kubernetes-ts-guestbook/simple/guestbook-dashboard.json", "w") as f:
    json.dump(dashboard, f, indent=2)

print("Dashboard updated successfully!")
