
# Makefile for the photo-management service
# This Makefile is used to automate the deployment process of the photo-management service
deploy:
	@echo "Validating, building, and deploying..."
	@bash -c '\
		sam validate && \
		sam validate --lint && \
		sam build --config-file deploy.toml --config-env photo-management && \
		sam deploy --config-file deploy.toml --config-env photo-management \
	'
