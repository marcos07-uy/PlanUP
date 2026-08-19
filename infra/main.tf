data "aws_caller_identity" "current" {}

locals {
  name        = "planup-${var.environment}"
  bucket_name = "planup-web-${var.environment}-${data.aws_caller_identity.current.account_id}"
  api_routes = toset([
    "GET /me",
    "GET /athletes",
    "POST /athletes",
    "GET /coach-sessions",
    "POST /coach-sessions",
    "POST /coach-sessions/{date}/{sessionId}/assign",
    "GET /athletes/{athleteId}/sessions",
    "PUT /athletes/{athleteId}/sessions/{date}",
    "DELETE /athletes/{athleteId}/sessions/{date}",
  ])
}

module "data" {
  source = "./modules/data"

  name = local.name
}

module "email" {
  source = "./modules/email"

  aws_region       = var.aws_region
  hosted_zone_name = var.hosted_zone_name
  email_domain     = var.email_domain
  mail_from_domain = var.mail_from_domain
}

module "auth" {
  source = "./modules/auth"

  name               = local.name
  email_identity_arn = module.email.identity_arn
  from_email_address = "PlanUp <${var.email_from_address}>"
}

module "api" {
  source = "./modules/api"

  name                       = local.name
  allowed_origins            = var.allowed_origins
  api_routes                 = local.api_routes
  lambda_source_file         = "${path.module}/../apps/api/dist/index.js"
  lambda_zip_output_path     = "${path.module}/.terraform/planup-api.zip"
  table_name                 = module.data.table_name
  table_arn                  = module.data.table_arn
  table_gsi1_arn             = module.data.gsi1_arn
  cognito_client_id          = module.auth.client_id
  cognito_user_pool_endpoint = module.auth.user_pool_endpoint
}

module "frontend" {
  source = "./modules/frontend"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name                 = local.name
  bucket_name          = local.bucket_name
  hosted_zone_name     = var.hosted_zone_name
  frontend_domain_name = var.frontend_domain_name
}

module "budget" {
  source = "./modules/budget"

  name                = "${local.name}-monthly"
  billing_alert_email = var.billing_alert_email
}

module "cicd" {
  source = "./modules/cicd"

  role_name           = "${local.name}-github-actions"
  github_oidc_subject = var.github_oidc_subject
}
