output "role_arn" {
  description = "IAM role ARN assumed by GitHub Actions."
  value       = aws_iam_role.github_actions.arn
}
