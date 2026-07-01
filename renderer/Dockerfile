# syntax=docker/dockerfile:1
# Base image ships Chromium + matching Playwright deps, so no browser download.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PORT=4000
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
EXPOSE 4000
CMD ["node", "server.js"]
