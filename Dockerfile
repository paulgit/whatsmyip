# Use the official PHP + Apache image
FROM php:8.2-apache

# Set the working directory inside the container
WORKDIR /var/www/html

# Copy website files to the container
COPY index.php /var/www/html/
COPY config.php /var/www/html/
COPY robots.txt /var/www/html/
ADD flags /var/www/html/flags

# Set correct permissions (optional)
RUN chown -R www-data:www-data /var/www/html

# Expose port 80 for web traffic
EXPOSE 80

# Start Apache
CMD ["apache2-foreground"]
