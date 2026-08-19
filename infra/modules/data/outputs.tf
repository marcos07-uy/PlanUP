output "table_name" {
  description = "DynamoDB table name."
  value       = aws_dynamodb_table.planup.name
}

output "table_arn" {
  description = "DynamoDB table ARN."
  value       = aws_dynamodb_table.planup.arn
}

output "gsi1_arn" {
  description = "DynamoDB GSI1 ARN."
  value       = "${aws_dynamodb_table.planup.arn}/index/GSI1"
}
