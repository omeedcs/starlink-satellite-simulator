const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// For GitHub Pages deployment - use conditional public path
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  mode: 'development', // Set development mode to get better debugging experience
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
    publicPath: isProduction ? './' : '/',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(glb|gltf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  ],
  devServer: {
    static: [
      { directory: path.join(__dirname, 'dist') },
      { directory: path.join(__dirname, 'src/assets'), publicPath: '/src/assets' },
      { directory: path.join(__dirname, 'public') }
    ],
    compress: true,
    port: 3002,
    hot: true,
  },
  performance: {
    hints: false, // Disable performance hints
    maxAssetSize: 1000000, // Increase the size limit to 1MB
    maxEntrypointSize: 1000000, // Increase the entrypoint size limit to 1MB
  },
};
