variable "name" {
  description = "Base name for API resources."
  type        = string
}

variable "allowed_origins" {
  description = "Origins allowed to call the API."
  type        = list(string)
}

variable "api_routes" {
  description = "HTTP API route keys served by the Lambda."
  type        = set(string)
}

variable "lambda_source_file" {
  description = "Path to the bundled Lambda source file."
  type        = string
}

variable "lambda_zip_output_path" {
  description = "Path where the Lambda zip archive should be written."
  type        = string
}

variable "table_name" {
  description = "DynamoDB table name used by the Lambda."
  type        = string
}

variable "table_arn" {
  description = "DynamoDB table ARN used in Lambda IAM policy."
  type        = string
}

variable "table_gsi1_arn" {
  description = "DynamoDB GSI1 ARN used in Lambda IAM policy."
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito app client ID accepted by the API authorizer."
  type        = string
}

variable "cognito_user_pool_endpoint" {
  description = "Cognito user pool endpoint used as JWT issuer."
  type        = string
}
