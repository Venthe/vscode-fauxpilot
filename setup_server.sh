#!/usr/bin/env bash

# TODO: It's not handling any error flow

TARGET_DIRECTORY="${TARGET_DIRECTORY:-/tmp}"

mkdir -p "${TARGET_DIRECTORY}"
git clone git@github.com:fauxpilot/fauxpilot.git "${TARGET_DIRECTORY}/fauxpilot"
cd "${TARGET_DIRECTORY}/fauxpilot"
./setup.sh