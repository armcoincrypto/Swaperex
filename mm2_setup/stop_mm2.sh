#!/bin/bash

# Stop MM2
echo "Stopping MM2..."

curl -s --url "http://127.0.0.1:7762" --data '{
    "userpass": "Testpass123#",
    "method": "stop"
}' 2>/dev/null

# Also kill any remaining processes
pkill -f "kdf" 2>/dev/null
pkill -f "mm2" 2>/dev/null

echo "MM2 stopped"
