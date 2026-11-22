#!/usr/bin/env bash
set -euo pipefail

sdk_root="${ANDROID_HOME:-${HOME}/Android/Sdk}"
tools_version="11076708"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

mkdir -p "${sdk_root}/cmdline-tools"
curl -fsSL \
  "https://dl.google.com/android/repository/commandlinetools-linux-${tools_version}_latest.zip" \
  -o "${work_dir}/commandlinetools.zip"
unzip -q "${work_dir}/commandlinetools.zip" -d "${work_dir}"
mkdir -p "${sdk_root}/cmdline-tools/latest"
cp -a "${work_dir}/cmdline-tools/." "${sdk_root}/cmdline-tools/latest/"

sdkmanager="${sdk_root}/cmdline-tools/latest/bin/sdkmanager"
"${sdkmanager}" --sdk_root="${sdk_root}" --licenses < <(yes)
"${sdkmanager}" --sdk_root="${sdk_root}" --install \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0"
