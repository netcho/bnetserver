FROM node:10-alpine

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
RUN apk add python make gcc g++
COPY package*.json /usr/src/app/
RUN npm install

# Bundle app source
COPY . /usr/src/app

EXPOSE 443 1119
CMD [ "npm", "run", "frontend" ]