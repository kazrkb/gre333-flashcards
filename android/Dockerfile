# Build environment for the Play Store package (Trusted Web Activity via Bubblewrap).
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
RUN npm install -g @bubblewrap/cli \
 && mkdir -p /root/.bubblewrap \
 && echo '{"jdkPath":"/opt/java/openjdk","androidSdkPath":"/opt/android"}' > /root/.bubblewrap/config.json
# Bubblewrap looks for the SDK tools under the legacy "tools" folder
RUN ln -s /opt/android/cmdline-tools/latest /opt/android/tools
WORKDIR /work
