# Build environment for the GRE Words Android app (plain WebView app, see app/).
# amd64 because Android's build tools (aapt2) ship only for x86_64 Linux.
FROM --platform=linux/amd64 eclipse-temurin:17-jdk
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*
ENV ANDROID_HOME=/opt/android
RUN mkdir -p $ANDROID_HOME/cmdline-tools && cd /tmp \
 && curl -fsSLo tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
 && unzip -q tools.zip && mv cmdline-tools $ANDROID_HOME/cmdline-tools/latest && rm tools.zip \
 && yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null \
 && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" >/dev/null
RUN $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-36" >/dev/null
WORKDIR /work
