FROM ghcr.io/valhalla/valhalla:3.8.3@sha256:70b45295d81035e3562e1bbf996a28d5fc55e1ccc5d7e3fff9f297d3b1a1359f
COPY image-data/ /routing/
EXPOSE 8002
ENTRYPOINT ["valhalla_service", "/routing/native-config.json", "1"]
