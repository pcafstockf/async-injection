// Our package.json doesn't list Jest (to keep the install lightweight), but Jest + IntelliJ makes debugging unit tests really easy.
module.exports = {
	testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
	transform: {
		'^.+\\.(ts|js|html)$': 'ts-jest'
	},
	moduleFileExtensions: ['ts', 'js', 'html'],
	modulePathIgnorePatterns: ["lib"],
	coverageReporters: ['html']
};
