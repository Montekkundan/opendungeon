FROM node:24-alpine

RUN npm install -g @montekkundan/opendungeon@latest

ENV PORT=3737
ENV OPENDUNGEON_BIND_HOST=0.0.0.0

EXPOSE 3737/tcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3737') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["opendungeon-host"]
