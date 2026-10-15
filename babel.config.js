module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Inlines `001_init.sql` style migration files so they can be bundled by
      // Metro and required from JavaScript (also works under Jest).
      [
        'inline-import',
        {
          extensions: ['.sql'],
        },
      ],
      // Reanimated 4 requires the worklets plugin and it must stay last.
      'react-native-worklets/plugin',
    ],
  };
};