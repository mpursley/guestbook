#!/bin/bash

COMMAND=$1

function usage() {
    echo "Usage: ./manage.sh [start|stop|status|port-forward|logs]"
    echo ""
    echo "Commands:"
    echo "  start         Starts podman, kind cluster, and deploys with Pulumi"
    echo "  stop          Destroys Pulumi deployments, deletes kind cluster, and stops podman"
    echo "  status        Shows the status of podman, kind, and kubernetes pods"
    echo "  port-forward  Forwards local ports to Grafana (8080) and Guestbook (8081)"
    echo "  logs          Streams logs for the guestbook frontend and redis components"
    exit 1
}

if [ -z "$COMMAND" ]; then
    usage
fi

export PATH=$PATH:~/.pulumi/bin

case "$COMMAND" in
    start)
        echo "=> Starting Podman Machine..."
        podman machine start
        
        echo "=> Creating Kind Cluster (if not exists)..."
        KIND_EXPERIMENTAL_PROVIDER=podman kind create cluster --name monitoring || true
        
        echo "=> Deploying Monitoring Stack with Pulumi..."
        (cd ../pulumi-monitoring && PULUMI_CONFIG_PASSPHRASE= pulumi up --yes)
        
        echo "=> Deploying Guestbook with Pulumi..."
        (cd ../examples/kubernetes-ts-guestbook/simple && PULUMI_CONFIG_PASSPHRASE= pulumi up --yes)
        ;;
    stop)
        echo "=> Destroying Guestbook with Pulumi..."
        (cd ../examples/kubernetes-ts-guestbook/simple && PULUMI_CONFIG_PASSPHRASE= pulumi destroy --yes) || true
        
        echo "=> Destroying Monitoring Stack with Pulumi..."
        (cd ../pulumi-monitoring && PULUMI_CONFIG_PASSPHRASE= pulumi destroy --yes) || true
        
        echo "=> Deleting Kind Cluster..."
        KIND_EXPERIMENTAL_PROVIDER=podman kind delete cluster --name monitoring
        
        echo "=> Stopping Podman Machine..."
        podman machine stop
        ;;
    status)
        echo "--- Podman Status ---"
        podman machine list
        echo ""
        echo "--- Kind Status ---"
        kind get clusters
        echo ""
        echo "--- Kubernetes Pods ---"
        kubectl get pods -A
        ;;
    port-forward)
        echo "=> Port forwarding Grafana and Guestbook Frontend..."
        echo "Grafana will be available at http://localhost:8080"
        echo "Guestbook will be available at http://localhost:8081"
        
        GRAFANA_SVC=$(kubectl get svc -n monitoring -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}')
        if [ ! -z "$GRAFANA_SVC" ]; then
            kubectl port-forward svc/$GRAFANA_SVC 8080:80 -n monitoring &
        else
            echo "Grafana service not found!"
        fi
        
        kubectl port-forward svc/frontend 8081:80 -n default &
        
        echo "Press Ctrl+C to stop port forwarding."
        wait
        ;;
    logs)
        echo "=> Streaming logs for Guestbook Frontend and Redis..."
        kubectl logs -l app=frontend -f &
        kubectl logs -l app=redis-leader -f &
        kubectl logs -l app=redis-replica -f &
        wait
        ;;
    *)
        usage
        ;;
esac
