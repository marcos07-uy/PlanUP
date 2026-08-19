data "aws_route53_zone" "email" {
  name         = var.hosted_zone_name
  private_zone = false
}

resource "aws_ses_domain_identity" "planup" {
  domain = var.email_domain
}

resource "aws_route53_record" "ses_verification" {
  zone_id = data.aws_route53_zone.email.zone_id
  name    = "_amazonses.${var.email_domain}"
  type    = "TXT"
  ttl     = 300
  records = [aws_ses_domain_identity.planup.verification_token]
}

resource "aws_ses_domain_identity_verification" "planup" {
  domain = aws_ses_domain_identity.planup.id

  depends_on = [aws_route53_record.ses_verification]
}

resource "aws_ses_domain_dkim" "planup" {
  domain = aws_ses_domain_identity.planup.domain
}

resource "aws_route53_record" "dkim" {
  for_each = toset(["0", "1", "2"])

  zone_id = data.aws_route53_zone.email.zone_id
  name    = "${aws_ses_domain_dkim.planup.dkim_tokens[tonumber(each.value)]}._domainkey.${var.email_domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_ses_domain_dkim.planup.dkim_tokens[tonumber(each.value)]}.dkim.amazonses.com"]
}

resource "aws_ses_domain_mail_from" "planup" {
  domain                 = aws_ses_domain_identity.planup.domain
  mail_from_domain       = var.mail_from_domain
  behavior_on_mx_failure = "RejectMessage"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = data.aws_route53_zone.email.zone_id
  name    = var.mail_from_domain
  type    = "MX"
  ttl     = 300
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = data.aws_route53_zone.email.zone_id
  name    = var.mail_from_domain
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.email.zone_id
  name    = "_dmarc.${var.email_domain}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=none; pct=100; adkim=r; aspf=r"]
}
