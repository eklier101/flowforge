# FlowForge

Self-hosted auto-scheduler for tasks and calendars. Plan work against your deadlines, busy times, and preferred hours — with a web UI and an Android app.

## Download Android APK

Get the latest APK from [GitHub Releases](https://github.com/eklier101/flowforge/releases/latest).

Direct asset (when published): [FlowForge.apk](https://github.com/eklier101/flowforge/releases/latest/download/FlowForge.apk)

## Docker image

```text
ghcr.io/eklier101/flowforge:latest
```

### Docker Compose

```yaml
services:
  flowforge:
    image: ghcr.io/eklier101/flowforge:latest
    container_name: flowforge
    ports:
      - "8098:8000"
    volumes:
      - ./data:/app/data
    environment:
      FLOWFORGE_PORT: "8000"
      FLOWFORGE_PUBLIC_URL: "https://your.domain.example"
    restart: unless-stopped
```

```bash
docker compose up -d
```

### Linux CLI

```bash
docker run -d \
  --name flowforge \
  -p 8098:8000 \
  -v flowforge-data:/app/data \
  -e FLOWFORGE_PUBLIC_URL="https://your.domain.example" \
  ghcr.io/eklier101/flowforge:latest
```

Then open `http://localhost:8098`.

## Feedback

- [Bug report](https://github.com/eklier101/flowforge/issues/new?template=bug_report.yml)
- [Feature request](https://github.com/eklier101/flowforge/issues/new?template=feature_request.yml)

## License

MIT — see [LICENSE](LICENSE).
