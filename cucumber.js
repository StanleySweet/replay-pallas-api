// Gherkin features, run against the compiled code: npm run test:features
module.exports = {
    default: {
        paths: ['features/**/*.feature'],
        require: ['features/support/**/*.js', 'features/steps/**/*.js'],
        format: ['summary'],
    },
};
