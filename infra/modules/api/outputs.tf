output "api_endpoint" {
  description = "HTTP API endpoint."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "lambda_function_name" {
  description = "API Lambda function name."
  value       = aws_lambda_function.api.function_name
}
