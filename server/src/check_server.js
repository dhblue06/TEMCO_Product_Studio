const fs = require('fs');
const path = require('path');
const express = require('express');

// Check if server is already running
const http = require('http');
const req = http.get('http://localhost:3001/api/health', (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => {
    console.log('Server already running:', data);
  });
});
req.on('error', () => {
  console.log('Server not running, need to start it');
});
req.end();
