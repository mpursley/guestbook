import pulumi
from pulumi_kubernetes.helm.v3 import Release, ReleaseArgs, RepositoryOptsArgs

# Deploy the kube-prometheus-stack Helm chart with Grafana exposed on NodePort
prometheus_stack = Release(
    "kube-prometheus-stack",
    ReleaseArgs(
        chart="kube-prometheus-stack",
        name="kube-prometheus-stack",
        version="69.3.1",
        repository_opts=RepositoryOptsArgs(
            repo="https://prometheus-community.github.io/helm-charts"
        ),
        namespace="monitoring",
        create_namespace=True,
        values={
            "grafana": {
                "service": {
                    "type": "NodePort",
                    "nodePort": 32080
                }
            }
        }
    ),
)

# Export Grafana access details
pulumi.export("grafana_url", "http://localhost:32080")
pulumi.export("grafana_username", "admin")
pulumi.export("grafana_password", "prom-operator")
