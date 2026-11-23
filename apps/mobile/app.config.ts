import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * SAMKRUSHI customer app — one shared Expo codebase, separate Android and iOS
 * release configuration (docs/adr/0009-mobile-release-configuration.md).
 *
 * APP_VARIANT selects development | preview | production. Store identifiers
 * are founder decisions and cannot change after the first store upload, so
 * they are injected from the environment:
 *   ANDROID_APPLICATION_ID, IOS_BUNDLE_IDENTIFIER, APP_DISPLAY_NAME, APP_SCHEME
 * development/preview fall back to an explicit non-production placeholder;
 * production refuses to resolve without real values.
 */

const VARIANTS = ['development', 'preview', 'production'] as const;
type AppVariant = (typeof VARIANTS)[number];

interface VariantSettings {
  nameSuffix: string;
  idSuffix: string;
  schemeSuffix: string;
}

const VARIANT_SETTINGS: Record<AppVariant, VariantSettings> = {
  development: { nameSuffix: ' (Dev)', idSuffix: '.dev', schemeSuffix: '-dev' },
  preview: { nameSuffix: ' (Preview)', idSuffix: '.preview', schemeSuffix: '-preview' },
  production: { nameSuffix: '', idSuffix: '', schemeSuffix: '' },
};

/** Reserved example domain — never submitted to a store. */
const PLACEHOLDER_APP_ID = 'com.example.samkrushi';
const DEFAULT_DISPLAY_NAME = 'SAMKRUSHI';
const DEFAULT_SCHEME = 'samkrushi';

/** Neutral placeholder colour until the approved brand palette exists. */
const PLACEHOLDER_BACKGROUND = '#F1F5F4';

function resolveVariant(raw: string | undefined): AppVariant {
  const value = raw ?? 'development';
  if (!(VARIANTS as readonly string[]).includes(value)) {
    throw new Error(`APP_VARIANT must be one of ${VARIANTS.join(', ')}; received "${value}"`);
  }
  return value as AppVariant;
}

function resolveIdentifier(variant: AppVariant, envName: string): string {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) {
    return `${fromEnv}${VARIANT_SETTINGS[variant].idSuffix}`;
  }
  if (variant === 'production') {
    throw new Error(
      `${envName} is required for production builds (founder-approved store identifier).`,
    );
  }
  return `${PLACEHOLDER_APP_ID}${VARIANT_SETTINGS[variant].idSuffix}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env.APP_VARIANT);
  const settings = VARIANT_SETTINGS[variant];
  const displayName =
    (process.env.APP_DISPLAY_NAME?.trim() || DEFAULT_DISPLAY_NAME) + settings.nameSuffix;
  const scheme = (process.env.APP_SCHEME?.trim() || DEFAULT_SCHEME) + settings.schemeSuffix;
  const easProjectId = process.env.EAS_PROJECT_ID?.trim();
  const easOwner = process.env.EAS_OWNER?.trim();

  return {
    ...config,
    name: displayName,
    slug: 'samkrushi',
    ...(easOwner ? { owner: easOwner } : {}),
    // Marketing version. Build numbers (versionCode/buildNumber) are managed
    // remotely by EAS (`appVersionSource: remote`) and auto-incremented.
    version: '0.1.0',
    scheme,
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/images/icon.png',
    experiments: { typedRoutes: true },

    // ---------------------------------------------------------------- Android
    // Release 1 target platform.
    android: {
      package: resolveIdentifier(variant, 'ANDROID_APPLICATION_ID'),
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: PLACEHOLDER_BACKGROUND,
      },
      // Request only permissions the app actually uses; each future permission
      // must be added deliberately and reflected in the Play Data safety form.
      permissions: [],
      blockedPermissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_CONTACTS',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
    },

    // -------------------------------------------------------------------- iOS
    // Maintained in parallel; store release follows Android.
    ios: {
      bundleIdentifier: resolveIdentifier(variant, 'IOS_BUNDLE_IDENTIFIER'),
      supportsTablet: false,
    },

    plugins: [
      'expo-router',
      'expo-dev-client',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: PLACEHOLDER_BACKGROUND,
        },
      ],
    ],

    extra: {
      appVariant: variant,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  };
};
