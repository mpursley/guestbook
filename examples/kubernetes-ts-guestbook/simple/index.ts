// Copyright 2016-2025, Pulumi Corporation.  All rights reserved.

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";

// Minikube does not implement services of type `LoadBalancer`; require the user to specify if we're
// running on minikube, and if so, create only services of type ClusterIP.
const config = new pulumi.Config();
const isMinikube = config.getBoolean("isMinikube");

//
// REDIS LEADER.
//

const redisLeaderLabels = { app: "redis-leader" };
const redisLeaderDeployment = new k8s.apps.v1.Deployment("redis-leader", {
    spec: {
        selector: { matchLabels: redisLeaderLabels },
        template: {
            metadata: { labels: redisLeaderLabels },
            spec: {
                containers: [
                    {
                        name: "redis-leader",
                        image: "redis",
                        resources: { requests: { cpu: "100m", memory: "100Mi" } },
                        ports: [{ name: "redis", containerPort: 6379 }],
                    },
                    {
                        name: "redis-exporter",
                        image: "oliver006/redis_exporter:latest",
                        resources: { requests: { cpu: "50m", memory: "50Mi" } },
                        ports: [{ name: "metrics", containerPort: 9121 }],
                        env: [{ name: "REDIS_ADDR", value: "redis://localhost:6379" }],
                    },
                ],
            },
        },
    },
});
const redisLeaderService = new k8s.core.v1.Service("redis-leader", {
    metadata: {
        name: "redis-leader",
        labels: redisLeaderLabels,
    },
    spec: {
        ports: [
            { name: "redis", port: 6379, targetPort: 6379 },
            { name: "metrics", port: 9121, targetPort: 9121 },
        ],
        selector: redisLeaderDeployment.spec.template.metadata.labels,
    },
});

//
// REDIS REPLICA.
//

const redisReplicaLabels = { app: "redis-replica" };
const redisReplicaDeployment = new k8s.apps.v1.Deployment("redis-replica", {
    spec: {
        selector: { matchLabels: redisReplicaLabels },
        template: {
            metadata: { labels: redisReplicaLabels },
            spec: {
                containers: [
                    {
                        name: "replica",
                        image: "redis",
                        command: ["redis-server", "--replicaof", "redis-leader", "6379"],
                        resources: { requests: { cpu: "100m", memory: "100Mi" } },
                        ports: [{ name: "redis", containerPort: 6379 }],
                    },
                    {
                        name: "redis-exporter",
                        image: "oliver006/redis_exporter:latest",
                        resources: { requests: { cpu: "50m", memory: "50Mi" } },
                        ports: [{ name: "metrics", containerPort: 9121 }],
                        env: [{ name: "REDIS_ADDR", value: "redis://localhost:6379" }],
                    },
                ],
            },
        },
    },
});
const redisReplicaService = new k8s.core.v1.Service("redis-replica", {
    metadata: {
        name: "redis-replica",
        labels: redisReplicaLabels,
    },
    spec: {
        ports: [
            { name: "redis", port: 6379, targetPort: 6379 },
            { name: "metrics", port: 9121, targetPort: 9121 },
        ],
        selector: redisReplicaDeployment.spec.template.metadata.labels,
    },
});

//
// FRONTEND
//

const frontendLabels = { app: "frontend" };
const frontendDeployment = new k8s.apps.v1.Deployment("frontend", {
    spec: {
        selector: { matchLabels: frontendLabels },
        replicas: 3,
        template: {
            metadata: { labels: frontendLabels },
            spec: {
                containers: [
                    {
                        name: "frontend",
                        image: "pulumi/guestbook-php-redis",
                        resources: { requests: { cpu: "100m", memory: "100Mi" } },
                        // If your cluster config does not include a dns service, then to instead access an environment
                        // variable to find the master service's host, change `value: "dns"` to read `value: "env"`.
                        env: [{ name: "GET_HOSTS_FROM", value: "dns" /* value: "env"*/ }],
                        ports: [{ name: "http", containerPort: 80 }],
                    },
                    {
                        name: "apache-exporter",
                        image: "bitnami/apache-exporter:latest",
                        resources: { requests: { cpu: "50m", memory: "50Mi" } },
                        ports: [{ name: "metrics", containerPort: 9117 }],
                        command: ["apache_exporter", "--scrape_uri", "http://localhost/server-status?auto"],
                    },
                ],
            },
        },
    },
});
const frontendService = new k8s.core.v1.Service("frontend", {
    metadata: {
        labels: frontendLabels,
        name: "frontend",
    },
    spec: {
        type: isMinikube ? "ClusterIP" : "LoadBalancer",
        ports: [
            { name: "http", port: 80, targetPort: 80 },
            { name: "metrics", port: 9117, targetPort: 9117 },
        ],
        selector: frontendDeployment.spec.template.metadata.labels,
    },
});

// Export the frontend IP.
export let frontendIp: pulumi.Output<string>;
if (isMinikube) {
    frontendIp = frontendService.spec.clusterIP;
} else {
    frontendIp = frontendService.status.loadBalancer.ingress[0].ip;
}

//
// SERVICEMONITOR
//

const serviceMonitor = new k8s.apiextensions.CustomResource("redis-monitor", {
    apiVersion: "monitoring.coreos.com/v1",
    kind: "ServiceMonitor",
    metadata: {
        name: "redis-monitor",
        // Add the label that kube-prometheus-stack looks for to scrape ServiceMonitors
        labels: {
            release: "kube-prometheus-stack"
        }
    },
    spec: {
        selector: {
            matchExpressions: [
                { key: "app", operator: "In", values: ["redis-leader", "redis-replica"] }
            ]
        },
        endpoints: [
            {
                port: "metrics",
                interval: "15s"
            }
        ]
    }
});

const frontendServiceMonitor = new k8s.apiextensions.CustomResource("frontend-monitor", {
    apiVersion: "monitoring.coreos.com/v1",
    kind: "ServiceMonitor",
    metadata: {
        name: "frontend-monitor",
        labels: {
            release: "kube-prometheus-stack"
        }
    },
    spec: {
        selector: {
            matchLabels: {
                app: "frontend"
            }
        },
        endpoints: [
            {
                port: "metrics",
                interval: "15s"
            }
        ]
    }
});

//
// GRAFANA DASHBOARD
//

const dashboardJson = fs.readFileSync("guestbook-dashboard.json", "utf8");

const dashboardConfigMap = new k8s.core.v1.ConfigMap("guestbook-dashboard", {
    metadata: {
        name: "guestbook-dashboard",
        labels: {
            grafana_dashboard: "1"
        }
    },
    data: {
        "guestbook-dashboard.json": dashboardJson
    }
});
