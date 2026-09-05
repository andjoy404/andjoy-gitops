package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public class GraphResponse {

    @JsonProperty("nodes")
    private List<GraphNode> nodes;
    @JsonProperty("edges")
    private List<GraphEdge> edges;
    @JsonProperty("metadata")
    private GraphMetadata metadata;

    public List<GraphNode> getNodes() { return nodes; }
    public void setNodes(List<GraphNode> nodes) { this.nodes = nodes; }

    public List<GraphEdge> getEdges() { return edges; }
    public void setEdges(List<GraphEdge> edges) { this.edges = edges; }

    public GraphMetadata getMetadata() { return metadata; }
    public void setMetadata(GraphMetadata metadata) { this.metadata = metadata; }

    public static class GraphMetadata {
        @JsonProperty("map_type")
        private String mapType;
        @JsonProperty("node_count")
        private Integer nodeCount;
        @JsonProperty("edge_count")
        private Integer edgeCount;

        public String getMapType() { return mapType; }
        public void setMapType(String mapType) { this.mapType = mapType; }

        public Integer getNodeCount() { return nodeCount; }
        public void setNodeCount(Integer nodeCount) { this.nodeCount = nodeCount; }

        public Integer getEdgeCount() { return edgeCount; }
        public void setEdgeCount(Integer edgeCount) { this.edgeCount = edgeCount; }
    }
}
