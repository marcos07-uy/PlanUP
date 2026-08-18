output "app_url" {
  description = "CloudFront URL for PlanUp."
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "api_url" {
  description = "HTTP API endpoint."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.planup.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "web_bucket" {
  value = aws_s3_bucket.web.id
}

output "frontend_env" {
  description = "Values to place in apps/web/.env.production before building the frontend."
  value       = <<-EOT
    VITE_API_URL=${aws_apigatewayv2_api.api.api_endpoint}
    VITE_COGNITO_USER_POOL_ID=${aws_cognito_user_pool.planup.id}
    VITE_COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.web.id}
    VITE_DEMO_MODE=false
  EOT
}

output "deploy_frontend_commands" {
  description = "Build and upload commands to run from the repository root after configuring the frontend environment."
  value       = <<-EOT
    npm run build --workspace @planup/web
    aws s3 sync apps/web/dist s3://${aws_s3_bucket.web.id} --delete
    aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.web.id} --paths '/*'
  EOT
}

