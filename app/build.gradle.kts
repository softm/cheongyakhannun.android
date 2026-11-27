plugins {
    id("com.android.application")
}

val webSource = rootProject.file("../cheongyakhannun/public")

android {
    namespace = "net.softm.cheongyakhannun"
    compileSdk = 36

    defaultConfig {
        applicationId = "net.softm.cheongyakhannun"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "1.0.2"

        val webUrl = providers.gradleProperty("CHEONGYAKHANNUN_WEB_URL")
            .orElse("https://softm.github.io/cheongyakhannun/")
            .get()
        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
        buildConfigField("String", "DATA_URL", "\"${webUrl}data/notices.json\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        create("release") {
            val storeFilePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (!storeFilePath.isNullOrBlank()) {
                storeFile = file(storeFilePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (!System.getenv("ANDROID_KEYSTORE_PATH").isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    implementation("androidx.activity:activity:1.12.1")
    implementation("androidx.core:core:1.17.0")
    implementation("androidx.fragment:fragment:1.9.1")
    implementation("androidx.webkit:webkit:1.17.1")
    implementation("androidx.work:work-runtime:2.12.0")
    implementation("com.github.softm:hannun-admob-android:1.0.6")
    implementation("com.github.softm:hannun-in-app-update-android:1.0.0")
    implementation("com.github.softm:hannun-in-app-review-android:1.0.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
}

val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    onlyIf { webSource.isDirectory }
    from(webSource)
    into(layout.projectDirectory.dir("src/main/assets/www"))
}

tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn(syncWebAssets)
}
