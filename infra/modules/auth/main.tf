resource "aws_cognito_user_pool" "planup" {
  name                     = var.name
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    mutable                  = false
    developer_only_attribute = false
    required                 = false

    string_attribute_constraints {
      min_length = 5
      max_length = 7
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  email_configuration {
    email_sending_account = var.use_ses_email ? "DEVELOPER" : "COGNITO_DEFAULT"
    source_arn            = var.use_ses_email ? var.email_identity_arn : null
    from_email_address    = var.use_ses_email ? var.from_email_address : null
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Tu código de verificación de PlanUp"
    email_message        = <<-HTML
      <p>Hola,</p>
      <p>Usá el siguiente código para continuar en PlanUp:</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">{####}</p>
      <p>Si no solicitaste este código, podés ignorar este mensaje.</p>
    HTML
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.planup.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"
  supported_identity_providers  = ["COGNITO"]
  explicit_auth_flows           = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  enable_token_revocation       = true
  access_token_validity         = 1
  id_token_validity             = 1
  refresh_token_validity        = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}
