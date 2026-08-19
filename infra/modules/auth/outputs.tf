output "user_pool_id" {
  description = "Cognito user pool ID."
  value       = aws_cognito_user_pool.planup.id
}

output "user_pool_endpoint" {
  description = "Cognito user pool endpoint."
  value       = aws_cognito_user_pool.planup.endpoint
}

output "client_id" {
  description = "Cognito app client ID."
  value       = aws_cognito_user_pool_client.web.id
}
