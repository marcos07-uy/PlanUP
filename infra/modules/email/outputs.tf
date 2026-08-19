output "identity_arn" {
  description = "Verified SES domain identity ARN."
  value       = aws_ses_domain_identity.planup.arn

  depends_on = [
    aws_ses_domain_identity_verification.planup,
    aws_route53_record.dkim,
    aws_route53_record.dmarc,
    aws_route53_record.mail_from_mx,
    aws_route53_record.mail_from_spf,
  ]
}

output "email_domain" {
  description = "Verified SES email domain."
  value       = aws_ses_domain_identity.planup.domain
}

output "mail_from_domain" {
  description = "Custom SES MAIL FROM domain."
  value       = aws_ses_domain_mail_from.planup.mail_from_domain
}
