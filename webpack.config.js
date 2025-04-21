const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    popup: path.join(__dirname, "src/popup/main.jsx"),
    content: path.join(__dirname, "src/content.js"),
    background: path.join(__dirname, "src/background.js")
  },
  output: {
    path: path.join(__dirname, "dist"),
    filename: "[name].js",
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              ["@babel/preset-react", {"runtime": "automatic"}]
            ],
            plugins: [
              "@babel/plugin-transform-runtime"
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
        exclude: /node_modules/,
        use: ["style-loader", "css-loader"],
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".js", ".jsx"]
  },
  resolve: {
    extensions: [".js", ".jsx"]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "src/popup/index.html"),
      filename: "popup.html",
      chunks: ["popup"],
      inject: 'body'
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/manifest.json",
          to: "."
        },
        { 
          from: "src/public/icons",
          to: "icons"
        },
        {
          from: "src/popup/styles/inject.css", 
          to: "inject.css"
        }
      ]
    })
  ],
  // Add this to fix source mapping
  devtool: 'cheap-module-source-map'
};