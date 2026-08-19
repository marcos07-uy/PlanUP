output "app_url" {
  description = "Custom HTTPS URL for the frontend."
  value       = "https://${var.frontend_domain_name}"
}

output "cloudfront_url" {
  description = "CloudFront distribution URL for the frontend."
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "bucket_id" {
  description = "Frontend S3 bucket ID."
  value       = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.web.id
}
