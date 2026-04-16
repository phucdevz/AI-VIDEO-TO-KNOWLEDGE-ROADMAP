FROM node:20-alpine

WORKDIR /app

ARG VITE_API_URL=http://localhost:8000
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_SITE_URL=

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_SITE_URL=${VITE_SITE_URL}

# Copy workspace manifests first for better layer caching.
COPY package*.json /app/
COPY apps/web/package*.json /app/apps/web/
COPY packages/design-tokens /app/packages/design-tokens

RUN npm install

# Copy full workspace after deps.
COPY . /app

WORKDIR /app/apps/web

RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
