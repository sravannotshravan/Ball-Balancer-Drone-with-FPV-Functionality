FROM node:20-alpine

WORKDIR /app

COPY --chown=node:node . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

EXPOSE 4173

USER node

CMD ["node", "server.js"]
