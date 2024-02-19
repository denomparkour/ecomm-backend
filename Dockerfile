FROM node:21 
WORKDIR /app/ecommerce/backend
RUN apt-get update && apt-get install -y git
RUN git clone https://github.com/denomparkour/ecomm-backend .
RUN npm install 
EXPOSE 8080
CMD [ "node", "index.js" ]


