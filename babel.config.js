module.exports = function (api) {
  api.cache(true);

  const plugins = [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@': './src',
          '@/components': './src/components',
          '@/store': './src/store',
          '@/utils': './src/utils',
          '@/types': './src/types',
          '@/hooks': './src/hooks',
          '@/services': './src/services',
          '@/constants': './src/constants',
        },
      },
    ],
  ];

  // Remove console.* statements in production builds
  if (process.env.NODE_ENV === 'production') {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};