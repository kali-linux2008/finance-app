# Bouwomgeving voor de Meridian-app (Android). Alles lokaal: geen Expo-account, geen Google-account.
FROM eclipse-temurin:17-jdk

ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_USER_HOME=/cache/gradle \
    npm_config_cache=/cache/npm
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip git ca-certificates xz-utils \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Android-bouwgereedschap van Google (alleen de downloads, geen account). Gradle haalt de rest zelf.
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
 && curl -fsSLo /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
 && unzip -q /tmp/tools.zip -d $ANDROID_HOME/cmdline-tools \
 && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
 && rm /tmp/tools.zip \
 && yes | sdkmanager --licenses > /dev/null \
 && sdkmanager "platform-tools"

COPY bouw-in-container.sh /usr/local/bin/bouw
RUN chmod +x /usr/local/bin/bouw
CMD ["bouw"]
