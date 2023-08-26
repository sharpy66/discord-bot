FROM node:20-alpine AS build

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies and add source files
COPY package.json env.json yarn.lock tsconfig.json bundle.sh *.js *.mjs ./
COPY ./src ./src
RUN yarn install --frozen-lockfile && sh -e ./bundle.sh

# Second stage
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy artifacts
COPY --from=build /usr/src/app/dist/ ./

RUN addgroup -S app -g 50000 && \
    adduser -S -g app -u 50000 app && \
    mkdir /data && chown app:app /data/

USER app

ENTRYPOINT [ "node", "server.js" ]
