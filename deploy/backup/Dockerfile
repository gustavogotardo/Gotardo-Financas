FROM alpine:3.20

RUN apk add --no-cache postgresql16-client curl ca-certificates \
    && curl -fsSL -o /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc \
    && chmod +x /usr/local/bin/mc

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

CMD ["/backup.sh"]