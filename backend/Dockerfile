FROM node:16

WORKDIR /app


RUN apt-get update && apt-get install -y \
    python3 \
    g++ \
    default-jdk \
    && apt-get clean

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
