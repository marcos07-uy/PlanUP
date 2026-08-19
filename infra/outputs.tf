output "app_url" {
  description = "Custom HTTPS URL for PlanUp."
  value       = module.frontend.app_url
}

output "cloudfront_url" {
  description = "CloudFront distribution URL for PlanUp."
  value       = module.frontend.cloudfront_url
}

output "api_url" {
  description = "HTTP API endpoint."
  value       = module.api.api_endpoint
}

output "cognito_user_pool_id" {
  value = module.auth.user_pool_id
}

output "cognito_client_id" {
  value = module.auth.client_id
}

output "web_bucket" {
  description = "S3 bucket containing the deployed frontend."
  value       = module.frontend.bucket_id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID used for cache invalidations."
  value       = module.frontend.cloudfront_distribution_id
}

output "github_actions_role_arn" {
  description = "IAM role assumed by the GitHub Actions plan and deploy jobs."
  value       = module.cicd.role_arn
}

output "frontend_env" {
  description = "Values to place in apps/web/.env.production before building the frontend."
  value       = <<-EOT
    VITE_API_URL=${module.api.api_endpoint}
    VITE_COGNITO_USER_POOL_ID=${module.auth.user_pool_id}
    VITE_COGNITO_CLIENT_ID=${module.auth.client_id}
    VITE_DEMO_MODE=false
  EOT
}

output "deploy_frontend_commands" {
  description = "Build and upload commands to run from the repository root after configuring the frontend environment."
  value       = <<-EOT
    npm run build --workspace @planup/web
    aws s3 sync apps/web/dist s3://${module.frontend.bucket_id} --delete
    aws cloudfront create-invalidation --distribution-id ${module.frontend.cloudfront_distribution_id} --paths '/*'
  EOT
}
