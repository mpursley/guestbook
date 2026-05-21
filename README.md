# Kubernetes Guestbook with Prometheus Monitoring

This repository contains a full deployment of the classic Kubernetes Guestbook application, modernized and deployed using Pulumi. It's fully instrumented with Prometheus monitoring, exporting custom metrics from both the Apache frontend and the Redis backend, and visualizes them through a rich Grafana dashboard.

## Architecture

*   **Frontend**: A PHP application running on Apache. Instrumentated via the Bitnami `apache-exporter` sidecar.
*   **Redis Leader**: The primary Redis cache. Instrumentated via the `redis_exporter` sidecar.
*   **Redis Replica**: The secondary Redis cache. Instrumentated via the `redis_exporter` sidecar.
*   **Monitoring Stack**: The `kube-prometheus-stack` deployed via Pulumi Helm charts, providing Prometheus, Grafana, Alertmanager, and necessary metrics components (node-exporter, kube-state-metrics).

## Prerequisites

*   **Kubernetes Cluster**: A running cluster (e.g., `kind`, `minikube`, or a cloud provider).
*   **Pulumi CLI**: Installed and configured.
*   **Node.js & Python**: Required by the Pulumi stacks.
*   **kubectl**: Configured to communicate with your cluster.

## Deployment Instructions

The deployment consists of two separate Pulumi stacks: one for the monitoring infrastructure, and one for the Guestbook application itself.

### 1. Deploy the Monitoring Stack (Python)

This stack installs Prometheus, Grafana, and the Prometheus Operator using Helm.

```bash
cd pulumi-monitoring
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export PULUMI_CONFIG_PASSPHRASE=""
pulumi login --local
pulumi stack select dev || pulumi stack init dev
pulumi up
```

### 2. Deploy the Guestbook Application (TypeScript)

This stack deploys the Redis leader, Redis replica, PHP frontend, exporter sidecars, ServiceMonitors, and the Grafana dashboard ConfigMap.

```bash
cd examples/kubernetes-ts-guestbook/simple
npm install
export PULUMI_CONFIG_PASSPHRASE=""
pulumi login --local
pulumi stack select dev || pulumi stack init dev
pulumi up
```

## Accessing the Dashboards

Once both stacks are deployed, you can access Grafana to view the metrics.

**Recommended: Automated Port-Forwarding**
You can use the provided management script to automatically port-forward Grafana and the Guestbook:
```bash
./pulumi-monitoring/scripts/manage.sh port-forward
```
This will expose Grafana at `http://localhost:8080` and the Guestbook at `http://localhost:8081`.

**Alternative: NodePort Access**
Grafana is also exposed on a NodePort service on port `32080`.
*   URL: `http://localhost:32080` (or `http://<NodeIP>:32080` depending on your cluster setup)
*   **Username**: `admin`
*   **Password**: Retrieve from the Kubernetes secret:
    ```bash
    kubectl get secret kube-prometheus-stack-grafana -n monitoring -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
    ```

## Verifying Monitoring Setup

To verify that Prometheus is actively scraping the Guestbook application metrics:

1.  **Access Prometheus**:
    ```bash
    kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n monitoring
    ```
    Open your browser to `http://localhost:9090`.

2.  **Check Targets**:
    Navigate to **Status > Targets** in the top navigation bar.
    You will see the target groups corresponding to the `ServiceMonitors`:
    *   `serviceMonitor/default/frontend-monitor/0` (Apache metrics)
    *   `serviceMonitor/default/redis-monitor/0` (Redis metrics)
    If their status is **UP**, Prometheus is successfully scraping them!

3.  **Check Grafana**:
    Open Grafana and navigate to the **"Guestbook Overview"** dashboard. You should see active data populating the graphs for "Frontend HTTP Requests", "Redis Memory Usage", and "Pod Network Traffic".
