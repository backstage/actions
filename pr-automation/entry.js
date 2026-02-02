require('../.pnp.cjs').setup();

require('ts-node').register({
  transpileOnly: true,
  project: require('path').resolve(__dirname, '../tsconfig.json'),
});

require('./main');
