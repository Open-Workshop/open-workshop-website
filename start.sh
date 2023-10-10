#!/bin/bash

mkdir -p website/sitemaps
while true; do
    screen -S open_workshop_website_exe python3 main.py
    sleep 60
done