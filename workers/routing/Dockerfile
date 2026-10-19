# Backport Valhalla #6291 without changing graph format or swallowing routing errors.
FROM ghcr.io/valhalla/valhalla:3.8.3@sha256:70b45295d81035e3562e1bbf996a28d5fc55e1ccc5d7e3fff9f297d3b1a1359f AS builder
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git g++ gcc cmake make pkg-config libboost-all-dev libcurl4-openssl-dev \
    libczmq-dev libgeos++-dev libluajit-5.1-dev liblz4-dev libprotobuf-dev \
    libsqlite3-dev libzmq3-dev protobuf-compiler zlib1g-dev libgeotiff-dev \
    libspatialite-dev libssl-dev python3-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init && git remote add origin https://github.com/valhalla/valhalla.git && \
    git fetch --depth 1 origin a60c7cbfc83e073f50887cd27e0109d02e6b64e5 && \
    git checkout --detach FETCH_HEAD && git submodule update --init --recursive --depth 1
COPY valhalla-elevator.patch /tmp/valhalla-elevator.patch
RUN echo '3200c465a7d00f421817d37da427dbeba34311b3ef42d7e19da2b4fea062cd92  /tmp/valhalla-elevator.patch' | sha256sum -c - && \
    git apply --check /tmp/valhalla-elevator.patch && git apply /tmp/valhalla-elevator.patch
ARG BUILD_JOBS=2
RUN cmake -B build -DCMAKE_BUILD_TYPE=RelWithDebInfo -DENABLE_PYTHON_BINDINGS=OFF \
    -DPython_FOUND=TRUE -DPython_EXECUTABLE=/usr/bin/python3 \
    -DENABLE_SINGLE_FILES_WERROR=OFF -DENABLE_TESTS=ON && \
    cmake --build build --target valhalla_service valhalla_build_tiles valhalla_test -j${BUILD_JOBS}
# Indoor synthetic fixtures do not need the unrelated global timezone download.
RUN cd build && make -f test/gurka/CMakeFiles/gurka_indoor.dir/build.make \
    test/gurka/CMakeFiles/gurka_indoor.dir/build -j${BUILD_JOBS} && \
    test/gurka/gurka_indoor && strip --strip-debug valhalla_service valhalla_build_tiles

FROM ghcr.io/valhalla/valhalla:3.8.3@sha256:70b45295d81035e3562e1bbf996a28d5fc55e1ccc5d7e3fff9f297d3b1a1359f AS engine
LABEL org.opencontainers.image.revision="a60c7cbfc83e073f50887cd27e0109d02e6b64e5" \
      hk.saanseoi.valhalla.upstream-fix="19fa3d585ff58e002f701319e6fffdbd16834d66"
COPY --from=builder /src/build/valhalla_service /src/build/valhalla_build_tiles /src/build/valhalla_build_extract /usr/local/bin/

FROM engine AS routing
COPY image-data/ /routing/
COPY graph-release.json /routing/release.json
RUN python3 -c 'import hashlib,json; f=open("/routing/graph.tar","rb"); assert hashlib.file_digest(f,"sha256").hexdigest()==json.load(open("/routing/release.json"))["graphSha256"], "Graph release checksum mismatch"'
EXPOSE 8002
ENTRYPOINT ["valhalla_service", "/routing/native-config.json", "1"]
