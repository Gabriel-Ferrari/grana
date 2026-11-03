import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application") version "8.13.2"
    id("org.jetbrains.kotlin.android") version "2.2.21"
}

android {
    namespace = "dev.grana.coletor"
    compileSdk = 36
    defaultConfig {
        applicationId = "dev.grana.coletor"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.2"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    // Trusted Web Activity: o ícone "grana" abre o app web no Chrome em tela cheia (login Google não roda em WebView).
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
